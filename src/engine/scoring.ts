import { Question, QuestionKind, TeamSide } from "../data/types";
import { isRightChoice } from "./kinds";
import { MAX_STREAK_BONUS } from "./streak-bonus-bound";

export interface ScoreResult {
  points: number;
  streakBonus: number;
  nextStreak: number;
  realityGapDelta: number;
}

// The bound lives in ./streak-bonus-bound.ts (boundary finding, 2026-09-28), re-exported here so
// every existing caller of MAX_STREAK_BONUS from scoring.ts keeps working unchanged.
export { MAX_STREAK_BONUS };

// Exported so tests/unit/points-table.test.ts can hold the player-facing points table (src/engine/points-table.ts) to it.
export const KIND_BASE_POINTS: Record<QuestionKind, number> = {
  binary: 100,
  estimate: 150,
  "myth-among-three": 150,
  "which-patient": 200,
  order: 250,
};

/**
 * Evaluates whether a voter's choice is correct, using the same isRightChoice rule the stage uses
 * to mark an option right (QA-FUNC-03). For every kind but estimate that rule is the single right
 * token the stage highlights as the truth (rightToken), so the room is scored against exactly what
 * is on screen. Estimate questions are the one exception: isRightChoice scores inside a tolerance
 * window around the authored value, so a neighboring range can also score as right even though the
 * stage still marks only the range containing the value as the truth (see optionTally's separate
 * right and truth flags in kinds.ts).
 */
export function evalAnswer(question: Question, voterChoice: string): boolean {
  return isRightChoice(question, voterChoice);
}

/**
 * Calculates the score, streak bonus, next streak, and reality gap delta for a single answer.
 * Complexity weights:
 * - binary: 100
 * - estimate / myth-among-three: 150
 * - which-patient: 200
 * - order: 250
 *
 * Streak bonus milestones:
 * - 3-streak: +50
 * - 5, 10, 15, ... (every 5): +100
 *
 * realityGapDelta is always 0.
 */
export function score(
  isRight: boolean,
  kind: QuestionKind = "binary",
  currentStreak: number = 0
): ScoreResult {
  if (!isRight) {
    return {
      points: 0,
      streakBonus: 0,
      nextStreak: 0,
      realityGapDelta: 0,
    };
  }

  const basePoints = KIND_BASE_POINTS[kind] ?? 100;
  const nextStreak = currentStreak + 1;

  let streakBonus = 0;
  if (nextStreak === 3) {
    streakBonus = 50;
  } else if (nextStreak >= 5 && nextStreak % 5 === 0) {
    streakBonus = 100;
  }

  const points = basePoints + streakBonus;

  return {
    points,
    streakBonus,
    nextStreak,
    realityGapDelta: 0,
  };
}

/**
 * Determines the next streak count based on room accuracy.
 * Follows the legacy logic: 60% or higher correct to maintain/build streak.
 */
export function computeNextStreak(currentStreak: number, correctPct: number): number {
  return correctPct >= 60 ? currentStreak + 1 : 0;
}

export interface TeamMemberStats {
  team?: string | TeamSide | null;
  correct?: number;
  answered?: number;
  score?: number;
}

/**
 * Calibrates team scores from devices as clinical accuracy percentage.
 */
export function calibrateTeamScore(devices: Record<string, TeamMemberStats>, teamId: TeamSide | string): number {
  let correct = 0;
  let answered = 0;
  if (devices && typeof devices === "object") {
    for (const member of Object.values(devices)) {
      if (member && member.team === teamId) {
        correct += typeof member.correct === "number" ? member.correct : 0;
        answered += typeof member.answered === "number" ? member.answered : 0;
      }
    }
  }
  return answered > 0 ? Math.round((correct / answered) * 100) : 0;
}
